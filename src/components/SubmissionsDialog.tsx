import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getWorkPhotoUrls } from "@/lib/workPhotos";

interface SubmissionRow {
  id: string;
  user_id: string;
  selected_answer: string;
  is_correct: boolean;
  points_earned: number;
  submitted_at: string;
  work_photo_path: string | null;
  display_name: string;
  photo_url: string | null;
}

interface SubmissionsDialogProps {
  problem: { id: string; title: string } | null;
  onClose: () => void;
}

/** Admin view of every student's answer and work photo for one problem. */
export function SubmissionsDialog({ problem, onClose }: SubmissionsDialogProps) {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!problem) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      setRows([]);
      try {
        const { data: submissions, error: subError } = await supabase
          .from("lmc_submissions")
          .select("id, user_id, selected_answer, is_correct, points_earned, submitted_at, work_photo_path")
          .eq("problem_id", problem.id)
          .order("submitted_at", { ascending: true });
        if (subError) throw subError;

        const list = submissions ?? [];
        const userIds = [...new Set(list.map((s) => s.user_id))];
        const photoPaths = list.map((s) => s.work_photo_path).filter((p): p is string => !!p);

        const [profilesRes, photoUrls] = await Promise.all([
          userIds.length
            ? supabase.from("lmc_profiles").select("user_id, display_name").in("user_id", userIds)
            : Promise.resolve({ data: [], error: null }),
          getWorkPhotoUrls(photoPaths),
        ]);
        if (profilesRes.error) throw profilesRes.error;

        const names = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]));
        if (cancelled) return;
        setRows(
          list.map((s) => ({
            ...s,
            display_name: names[s.user_id] ?? "Unknown student",
            photo_url: s.work_photo_path ? photoUrls[s.work_photo_path] ?? null : null,
          }))
        );
      } catch (err) {
        console.error("Error loading submissions:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [problem]);

  return (
    <Dialog open={!!problem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submissions: {problem?.title}</DialogTitle>
          <DialogDescription>
            {loading ? "Loading..." : `${rows.length} submission${rows.length === 1 ? "" : "s"}, in the order they were submitted.`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="py-8 text-center text-muted-foreground">Couldn't load submissions. Please try again.</p>
        ) : !loading && rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No submissions yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rows.map((row) => (
              <div key={row.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.submitted_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm whitespace-nowrap">
                    {row.is_correct ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    Answer {row.selected_answer} · {row.points_earned} pts
                  </div>
                </div>
                {row.photo_url ? (
                  <a href={row.photo_url} target="_blank" rel="noopener noreferrer" title="Open full size">
                    <img
                      src={row.photo_url}
                      alt={`${row.display_name}'s work`}
                      className="w-full max-h-72 object-contain rounded border bg-muted"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <div className="flex items-center justify-center gap-2 h-24 rounded border bg-muted text-sm text-muted-foreground">
                    <ImageOff className="w-4 h-4" />
                    No photo
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
