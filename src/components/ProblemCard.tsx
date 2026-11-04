import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, CheckCircle2, Send, Lightbulb, XCircle, Camera, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MathText } from "@/components/MathText";
import { uploadWorkPhoto } from "@/lib/workPhotos";

interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
  points: number;
  week_number: number;
  due_date: string;
  hint?: string;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

interface ProblemCardProps {
  problem: Problem;
  userId?: string;
  existingSubmission?: { selected_answer: string; is_correct: boolean } | null;
  onSubmissionComplete?: () => void;
  setExistingSubmission?: (submission: { selected_answer: string; is_correct: boolean } | null) => void;
  onPointsUpdate?: (pointsEarned: number, isCorrect: boolean) => void;
}

export function ProblemCard({ 
  problem, 
  userId, 
  existingSubmission, 
  onSubmissionComplete,
  setExistingSubmission,
  onPointsUpdate 
}: ProblemCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{ correct: boolean; answer: string } | null>(null);
  const [workPhoto, setWorkPhoto] = useState<File | null>(null);
  const [workPhotoPreview, setWorkPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!workPhoto) {
      setWorkPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(workPhoto);
    setWorkPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [workPhoto]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      toast({
        title: "Not a Photo",
        description: "Please choose an image file of your work.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    setWorkPhoto(file);
  };

  const clearPhoto = () => {
    setWorkPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  useEffect(() => {
    if (existingSubmission) {
      setSubmissionResult({
        correct: existingSubmission.is_correct,
        answer: existingSubmission.selected_answer
      });
      setSelectedAnswer(existingSubmission.selected_answer);
    } else {
      setSubmissionResult(null);
      setSelectedAnswer("");
    }
  }, [existingSubmission]);

  const options = [
    { value: "A", label: problem.option_a },
    { value: "B", label: problem.option_b },
    { value: "C", label: problem.option_c },
    { value: "D", label: problem.option_d },
  ];

  const handleSubmit = async () => {
    if (!selectedAnswer) {
      toast({
        title: "No Answer Selected",
        description: "Please select an answer before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!userId) {
      toast({
        title: "Login Required",
        description: "Please log in to submit your answer.",
        variant: "destructive",
      });
      return;
    }

    if (new Date(problem.due_date).getTime() <= Date.now()) {
      toast({
        title: "Problem Closed",
        description: "The due date for this problem has passed. Check Past Problems for the solution.",
        variant: "destructive",
      });
      return;
    }

    if (!workPhoto) {
      toast({
        title: "Photo Required",
        description: "Please add a photo of your work before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (existingSubmission) {
      toast({
        title: "Already Submitted",
        description: "You've already submitted an answer for this problem.",
        variant: "default",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const isCorrect = selectedAnswer === problem.correct_answer;
      const pointsEarned = isCorrect ? problem.points : Math.floor(problem.points * 0.1);

      // Upload first: the database only accepts a submission whose photo exists.
      const workPhotoPath = await uploadWorkPhoto(userId, problem.id, workPhoto);

      const { data: submission, error } = await supabase
        .from("lmc_submissions")
        .insert({
          user_id: userId,
          problem_id: problem.id,
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
          points_earned: pointsEarned,
          work_photo_path: workPhotoPath,
        })
        .select()
        .single();

      if (error) throw error;

      setSubmissionResult({ correct: isCorrect, answer: selectedAnswer });
      if (setExistingSubmission) {
        setExistingSubmission({
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
        });
      }
      
      if (onPointsUpdate) {
        onPointsUpdate(pointsEarned, isCorrect);
      }

      toast({
        title: isCorrect ? "Correct!" : "Not Quite",
        description: isCorrect
          ? `You earned ${pointsEarned} points!`
          : `Your answer was incorrect. You earned ${pointsEarned} points for attempting.`,
      });

      if (onSubmissionComplete && submission) {
        await onSubmissionComplete();
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred while submitting your answer.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-2xl">{problem.title}</CardTitle>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                <span>Week {problem.week_number}</span>
              </div>
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                <span>Due {new Date(problem.due_date).toLocaleDateString()}</span>
              </div>
              <Badge variant={problem.difficulty as "Easy" | "Medium" | "Hard"}>
                {problem.difficulty}
              </Badge>
              <Badge variant="outline">{problem.points} points</Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div 
          className="prose max-w-none mb-6 select-none"
          style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
          onContextMenu={(e) => e.preventDefault()}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'a' || e.key === 'x')) {
              e.preventDefault();
            }
          }}
        >
          <MathText as="div" text={problem.description} />
        </div>

        {problem.hint && (
          <div className="mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHint(!showHint)}
              className="flex items-center gap-1"
            >
              <Lightbulb className="w-4 h-4" />
              {showHint ? "Hide Hint" : "Show Hint"}
            </Button>
            {showHint && (
              <MathText as="div" text={problem.hint} className="mt-2 text-sm text-muted-foreground" />
            )}
          </div>
        )}

        {!submissionResult ? (
          <>
            <RadioGroup
              value={selectedAnswer}
              onValueChange={setSelectedAnswer}
              className="space-y-2 mb-6"
            >
              {options.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`option-${option.value}`}
                    disabled={isSubmitting}
                  />
                  <Label htmlFor={`option-${option.value}`} className="text-base">
                    <MathText text={option.label} />
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="mb-6 space-y-2">
              <Label htmlFor="work-photo" className="text-base">
                Photo of your work <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Take or upload a picture of your work showing how you solved the problem.
              </p>
              <input
                ref={photoInputRef}
                id="work-photo"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handlePhotoChange}
                disabled={isSubmitting}
              />
              {workPhotoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={workPhotoPreview}
                    alt="Your work"
                    className="max-h-64 rounded-lg border object-contain"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={clearPhoto}
                    disabled={isSubmitting}
                    aria-label="Remove photo"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isSubmitting}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Add Photo
                </Button>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedAnswer || !workPhoto}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Answer
                </>
              )}
            </Button>
          </>
        ) : (
          <div
            className={`p-4 rounded-lg ${
              submissionResult.correct ? "bg-success/10" : "bg-destructive/10"
            }`}
          >
            <div className="flex items-center gap-2">
              {submissionResult.correct ? (
                <CheckCircle2 className="w-5 h-5 text-success" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive" />
              )}
              <h3 className="font-medium">
                {submissionResult.correct ? "Correct!" : "Incorrect"}
              </h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {submissionResult.correct
                ? "Great job! Your answer is correct."
                : `Sorry, your answer was incorrect. Contact an officer if you think this is a mistake.`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}