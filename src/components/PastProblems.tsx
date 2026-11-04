import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, XCircle, History, MinusCircle } from "lucide-react";
import { MathText } from "@/components/MathText";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PastProblem {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  points: number;
  week_number: number;
  due_date: string;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

interface UserSubmission {
  selected_answer: string;
  is_correct: boolean;
  points_earned: number;
}

interface PastProblemsProps {
  userId?: string;
}

export function PastProblems({ userId }: PastProblemsProps) {
  const [problems, setProblems] = useState<PastProblem[]>([]);
  const [solutions, setSolutions] = useState<Record<string, string>>({});
  const [submissions, setSubmissions] = useState<Record<string, UserSubmission>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: problemRows, error: problemError } = await supabase
          .from("problems")
          .select(
            "id, title, description, difficulty, points, week_number, due_date, correct_answer, option_a, option_b, option_c, option_d"
          )
          .eq("was_published", true)
          .eq("is_archived", false)
          .lte("due_date", new Date().toISOString())
          .order("due_date", { ascending: false });
        if (problemError) throw problemError;

        const rows = problemRows ?? [];
        const ids = rows.map((p) => p.id);

        const [solutionRes, submissionRes] = await Promise.all([
          ids.length
            ? supabase.from("problem_solutions").select("problem_id, solution").in("problem_id", ids)
            : Promise.resolve({ data: [], error: null }),
          ids.length && userId
            ? supabase
                .from("submissions")
                .select("problem_id, selected_answer, is_correct, points_earned")
                .eq("user_id", userId)
                .in("problem_id", ids)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (solutionRes.error) throw solutionRes.error;
        if (submissionRes.error) throw submissionRes.error;

        if (cancelled) return;
        setProblems(rows);
        setSolutions(Object.fromEntries((solutionRes.data ?? []).map((s) => [s.problem_id, s.solution])));
        setSubmissions(
          Object.fromEntries(
            (submissionRes.data ?? []).map((s) => [
              s.problem_id,
              { selected_answer: s.selected_answer, is_correct: s.is_correct, points_earned: s.points_earned },
            ])
          )
        );
      } catch (err) {
        console.error("Error loading past problems:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 tracking-wider">
          <History className="w-6 h-6 text-primary" />
          PAST PROBLEMS
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Loading past problems...</p>
        ) : error ? (
          <p className="py-8 text-center text-muted-foreground">Couldn't load past problems. Please try again later.</p>
        ) : problems.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No past problems yet. Solutions appear here after each problem's due date.
          </p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {problems.map((problem) => (
              <PastProblemItem
                key={problem.id}
                problem={problem}
                solution={solutions[problem.id]}
                submission={submissions[problem.id]}
                showResult={Boolean(userId)}
              />
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

function PastProblemItem({
  problem,
  solution,
  submission,
  showResult,
}: {
  problem: PastProblem;
  solution?: string;
  submission?: UserSubmission;
  showResult: boolean;
}) {
  const options = [
    { value: "A", label: problem.option_a },
    { value: "B", label: problem.option_b },
    { value: "C", label: problem.option_c },
    { value: "D", label: problem.option_d },
  ];

  return (
    <AccordionItem value={problem.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-3 text-left">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Week {problem.week_number}</span>
          <span className="font-medium">{problem.title}</span>
          <Badge variant={problem.difficulty as "Easy" | "Medium" | "Hard"}>{problem.difficulty}</Badge>
          {showResult && (
            <span className="ml-auto flex items-center gap-1 text-sm font-normal">
              {!submission ? (
                <>
                  <MinusCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Not attempted</span>
                </>
              ) : submission.is_correct ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-success">Correct</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span className="text-destructive">Incorrect</span>
                </>
              )}
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Due {new Date(problem.due_date).toLocaleDateString()} · {problem.points} points
        </p>

        <MathText as="div" text={problem.description} className="text-base" />

        <ul className="space-y-2">
          {options.map((option) => {
            const isCorrect = option.value === problem.correct_answer;
            const isUserWrongPick = submission?.selected_answer === option.value && !isCorrect;
            return (
              <li
                key={option.value}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-base",
                  isCorrect && "border-success/40 bg-success/10",
                  isUserWrongPick && "border-destructive/40 bg-destructive/10"
                )}
              >
                <span className="font-semibold">{option.value}.</span>
                <MathText text={option.label} className="flex-1" />
                {isCorrect && <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-success" aria-label="Correct answer" />}
                {isUserWrongPick && <XCircle className="mt-0.5 w-4 h-4 shrink-0 text-destructive" aria-label="Your answer" />}
                {submission?.selected_answer === option.value && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Your answer</span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="rounded-md bg-muted/50 p-4">
          <h4 className="mb-2 text-sm font-semibold tracking-wide">SOLUTION</h4>
          {solution ? (
            <MathText as="div" text={solution} className="text-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">
              The answer is <span className="font-semibold">{problem.correct_answer}</span>. No written solution was posted
              for this problem.
            </p>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
