import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Target, Trophy } from "lucide-react";

interface StatsCardProps {
  totalPoints: number;
  problemsSolved: number;
  rank: number;
}

export function StatsCard({ totalPoints, problemsSolved, rank }: StatsCardProps) {
  return (
    <Card variant="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 tracking-wide">
          <Target className="w-5 h-5 text-primary" />
          YOUR STATS
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-2xl font-bold text-gradient font-display">{totalPoints}</p>
            <p className="text-xs text-muted-foreground">Total Points</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-gold/5 border border-gold/20">
            <div className="flex items-center justify-center gap-1">
              <Trophy className="w-4 h-4 text-gold" />
              <span className="text-2xl font-bold text-gold font-display">#{rank}</span>
            </div>
            <p className="text-xs text-muted-foreground">Rank</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-success/5 border border-success/20">
            <div className="flex items-center justify-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="text-2xl font-bold text-success font-display">{problemsSolved}</span>
            </div>
            <p className="text-xs text-muted-foreground">Solved</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
