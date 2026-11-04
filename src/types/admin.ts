export interface ProblemFormData {
  id?: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  points: number;
  week_number: number;
  due_date: string;
  hint: string;
  /** Stored separately in lmc_problem_solutions; visible to students after the due date. */
  solution: string;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  is_active: boolean;
}
