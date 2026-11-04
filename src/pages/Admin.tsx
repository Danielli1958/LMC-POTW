import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, RotateCcw, Archive, ArchiveRestore, Images } from 'lucide-react';
import { SubmissionsDialog } from '@/components/SubmissionsDialog';
import { ProblemFormData } from '@/types/admin';
import { toast } from 'sonner';
import { resetYearlyLeaderboard } from '@/lib/admin';
import { MathEditor } from '@/components/MathEditor';

/** Formats a Date for an <input type="datetime-local">, in the browser's local time. */
const toLocalDateTimeInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const initialFormData: ProblemFormData = {
  title: '',
  description: '',
  difficulty: 'Medium',
  points: 10,
  week_number: 1,
  due_date: toLocalDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  hint: '',
  solution: '',
  correct_answer: 'A',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  is_active: true,
};

export default function Admin() {
  const [problems, setProblems] = useState<any[]>([]);
  const [formData, setFormData] = useState<ProblemFormData>({ ...initialFormData });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState("manage-problems");
  const [isResettingLeaderboard, setIsResettingLeaderboard] = useState(false);
  const [viewingSubmissionsFor, setViewingSubmissionsFor] = useState<{ id: string; title: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: profile } = await supabase
        .from('lmc_profiles')
        .select('is_admin')
        .eq('user_id', user.id)
        .single();

      if (!profile?.is_admin) {
        toast.error('Unauthorized access');
        navigate('/');
        return;
      }

      setIsAdmin(true);
      await fetchProblems();
    } catch (error) {
      console.error('Error checking admin status:', error);
      toast.error('Error verifying permissions');
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProblems = async () => {
    try {
      const { data, error } = await supabase
        .from('lmc_problems')
        .select('*')
        .order('week_number', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProblems(data || []);
    } catch (error) {
      console.error('Error fetching problems:', error);
      toast.error('Failed to load problems');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'points' || name === 'week_number' ? Number(value) : value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: name === 'is_active' ? value === 'true' : value
    }));
  };

  const saveSolution = async (problemId: string, solution: string) => {
    if (solution.trim()) {
      const { error } = await supabase
        .from('lmc_problem_solutions')
        .upsert({ problem_id: problemId, solution, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('lmc_problem_solutions').delete().eq('problem_id', problemId);
      if (error) throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The solution is stored in its own table so students can't read it before the due date.
    const { solution, ...problemFields } = formData;
    const problemData = {
      ...problemFields,
      // datetime-local is in the admin's local time; store it as an absolute UTC time.
      due_date: new Date(formData.due_date).toISOString(),
    };
    try {
      if (isEditing && formData.id) {
        const { error } = await supabase
          .from('lmc_problems')
          .update({ ...problemData, updated_at: new Date().toISOString() })
          .eq('id', formData.id);

        if (error) throw error;
        await saveSolution(formData.id, solution);
        toast.success('Problem updated successfully');
        setActiveTab("manage-problems");
      } else {
        const { data: created, error } = await supabase
          .from('lmc_problems')
          .insert([problemData])
          .select('id')
          .single();

        if (error) throw error;
        await saveSolution(created.id, solution);
        toast.success('Problem added successfully');
        resetForm();
      }

      fetchProblems();
    } catch (error) {
      console.error('Error saving problem:', error);
      toast.error('Failed to save problem');
    }
  };

  const handleEdit = async (problem: any) => {
    setFormData({
      ...problem,
      due_date: problem.due_date ? toLocalDateTimeInput(new Date(problem.due_date)) : '',
      solution: '',
    });
    setIsEditing(true);
    setActiveTab("add-problem");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const { data, error } = await supabase
      .from('lmc_problem_solutions')
      .select('solution')
      .eq('problem_id', problem.id)
      .maybeSingle();
    if (error) {
      console.error('Error loading solution:', error);
      toast.error('Failed to load the solution for this problem');
      return;
    }
    if (data) {
      setFormData(prev => (prev.id === problem.id ? { ...prev, solution: data.solution } : prev));
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const { error } = await supabase
        .from('lmc_problems')
        .update({ is_archived: true, is_active: false })
        .eq('id', id);

      if (error) throw error;

      toast.success('Problem archived');
      fetchProblems();
    } catch (error) {
      console.error('Error archiving problem:', error);
      toast.error('Failed to archive problem');
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      const { error } = await supabase
        .from('lmc_problems')
        .update({ is_archived: false })
        .eq('id', id);

      if (error) throw error;

      toast.success('Problem unarchived');
      fetchProblems();
    } catch (error) {
      console.error('Error unarchiving problem:', error);
      toast.error('Failed to unarchive problem');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this problem?')) return;
    
    try {
      const { error } = await supabase
        .from('lmc_problems')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Problem deleted successfully');
      fetchProblems();
    } catch (error) {
      console.error('Error deleting problem:', error);
      toast.error('Failed to delete problem');
    }
  };

  const resetForm = () => {
    setFormData({ ...initialFormData });
    setIsEditing(false);
  };

  const handleResetLeaderboard = async () => {
    const confirmed = window.confirm(
      "Start a new school year? This will reset every student's points, problems solved, " +
      "and streak back to 0 on the leaderboard. Their All-Time totals will NOT be affected. " +
      "This cannot be undone."
    );
    if (!confirmed) return;

    setIsResettingLeaderboard(true);
    try {
      await resetYearlyLeaderboard();
      toast.success('Leaderboard reset for the new school year');
    } catch (error) {
      console.error('Error resetting leaderboard:', error);
      toast.error('Failed to reset leaderboard');
    } finally {
      setIsResettingLeaderboard(false);
    }
  };

  if (isLoading || isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const activeProblems = problems.filter((problem) => !problem.is_archived);
  const archivedProblems = problems.filter((problem) => problem.is_archived);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p>You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      
      <Tabs 
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          if (value === 'add-problem') {
            resetForm();
          }
        }}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="manage-problems">Manage Problems</TabsTrigger>
          <TabsTrigger value="add-problem">Add New Problem</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="add-problem">
          <Card>
            <CardHeader>
              <CardTitle>{isEditing ? 'Edit Problem' : 'Add New Problem'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => {
                e.preventDefault();
                // The math editors aren't native inputs, so check required fields here.
                const missing = [
                  !formData.description.trim() && 'Problem',
                  ...(['a', 'b', 'c', 'd'] as const).map(
                    (o) => !formData[`option_${o}`].trim() && `Option ${o.toUpperCase()}`
                  ),
                ].filter(Boolean);
                if (missing.length) {
                  toast.error(`Please fill in: ${missing.join(', ')}`);
                  return;
                }
                handleSubmit(e);
                if (isEditing) {
                  setIsEditing(false);
                  resetForm();
                }
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Difficulty</label>
                    <Select
                      value={formData.difficulty}
                      onValueChange={(value) => handleSelectChange('difficulty', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Points</label>
                    <Input
                      type="number"
                      name="points"
                      value={formData.points}
                      onChange={handleInputChange}
                      min="1"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Week Number</label>
                    <Input
                      type="number"
                      name="week_number"
                      value={formData.week_number}
                      onChange={handleInputChange}
                      min="1"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Due Date</label>
                    <Input
                      type="datetime-local"
                      name="due_date"
                      value={formData.due_date}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select
                      value={String(formData.is_active)}
                      onValueChange={(value) => handleSelectChange('is_active', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Active</SelectItem>
                        <SelectItem value="false">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Problem</label>
                  <MathEditor
                    multiline
                    value={formData.description}
                    onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Hint (Optional)</label>
                  <MathEditor
                    multiline
                    value={formData.hint ?? ''}
                    onChange={(value) => setFormData(prev => ({ ...prev, hint: value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Solution (Optional)</label>
                  <p className="text-xs text-muted-foreground">
                    Shown to students in Past Problems after the due date.
                  </p>
                  <MathEditor
                    multiline
                    value={formData.solution}
                    onChange={(value) => setFormData(prev => ({ ...prev, solution: value }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['A', 'B', 'C', 'D'].map((option) => (
                    <div key={option} className="space-y-2">
                      <label className="text-sm font-medium">Option {option}</label>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 min-w-0">
                          <MathEditor
                            value={(formData[`option_${option.toLowerCase()}` as keyof ProblemFormData] as string) ?? ''}
                            onChange={(value) =>
                              setFormData(prev => ({ ...prev, [`option_${option.toLowerCase()}`]: value }))
                            }
                          />
                        </div>
                        <input
                          type="radio"
                          name="correct_answer"
                          checked={formData.correct_answer === option}
                          onChange={() => handleSelectChange('correct_answer', option)}
                          className="h-4 w-4"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="submit">
                    {isEditing ? 'Update Problem' : 'Add Problem'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage-problems">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Manage Problems</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setActiveTab("add-problem");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Problem
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeProblems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No problems found. Add your first problem above.
                </p>
              ) : (
                <div className="space-y-4">
                  {activeProblems.map((problem) => (
                    <div key={problem.id} className="border rounded-lg p-4 flex justify-between items-center">
                      <div>
                        <h3 className="font-medium">{problem.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          Week {problem.week_number} • {problem.difficulty} • {problem.points} points •
                          Status: <span className={
                            new Date(problem.due_date) <= new Date()
                              ? 'text-muted-foreground'
                              : problem.is_active ? 'text-green-600' : 'text-amber-600'
                          }>
                            {new Date(problem.due_date) <= new Date()
                              ? 'Closed (past due)'
                              : problem.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewingSubmissionsFor({ id: problem.id, title: problem.title })}
                        >
                          <Images className="h-4 w-4 mr-2" />
                          Submissions
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(problem)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleArchive(problem.id)}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(problem.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Archived Problems</CardTitle>
            </CardHeader>
            <CardContent>
              {archivedProblems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No archived problems yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {archivedProblems.map((problem) => (
                    <div key={problem.id} className="border rounded-lg p-4 flex justify-between items-center opacity-75">
                      <div>
                        <h3 className="font-medium">{problem.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          Week {problem.week_number} • {problem.difficulty} • {problem.points} points
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewingSubmissionsFor({ id: problem.id, title: problem.title })}
                        >
                          <Images className="h-4 w-4 mr-2" />
                          Submissions
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnarchive(problem.id)}
                        >
                          <ArchiveRestore className="h-4 w-4 mr-2" />
                          Unarchive
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(problem.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Card>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Reset the leaderboard at the start of every year
              </p>
              <Button
                variant="destructive"
                onClick={handleResetLeaderboard}
                disabled={isResettingLeaderboard}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {isResettingLeaderboard ? 'Resetting...' : 'Reset Leaderboard for New School Year'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SubmissionsDialog
        problem={viewingSubmissionsFor}
        onClose={() => setViewingSubmissionsFor(null)}
      />
    </div>
  );
}
