import { Trophy, Star, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  rank: number;
  display_name: string;
  total_points: number;
  problems_solved: number;
  current_streak: number;
  user_id?: string;
  is_current_user?: boolean;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  title?: string;
  emptyMessage?: string;
}

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Trophy className="w-5 h-5 text-gold animate-float" />;
    case 2:
      return <Medal className="w-5 h-5 text-silver" />;
    case 3:
      return <Medal className="w-5 h-5 text-bronze" />;
    default:
      return <span className="w-5 h-5 flex items-center justify-center text-sm font-semibold text-muted-foreground">{rank}</span>;
  }
};

const getRankStyle = (rank: number) => {
  switch (rank) {
    case 1:
      return "bg-gold/5 border-gold/30 hover:border-gold/50";
    case 2:
      return "bg-silver/5 border-silver/30 hover:border-silver/50";
    case 3:
      return "bg-bronze/5 border-bronze/30 hover:border-bronze/50";
    default:
      return "bg-card border-border hover:border-primary/30";
  }
};

export function Leaderboard({ entries, currentUserId, title, emptyMessage }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>{emptyMessage || 'No students on the leaderboard yet.'}</p>
        <p className="text-sm">Be the first to solve a problem!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-center text-muted-foreground">
        {title || (currentUserId ? '' : '')}
      </h3>
      {entries.map((entry, index) => (
        <div
          key={entry.display_name + index}
          className={cn(
            "flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-300 relative overflow-hidden group",
            "animate-slide-up",
            getRankStyle(entry.rank),
            entry.user_id === currentUserId && [
              "border-primary/80 bg-gradient-to-r from-primary/5 to-primary/10 shadow-lg relative ring-1 ring-primary/30",
              "before:content-[''] before:absolute before:left-0 before:top-0 before:h-full before:w-1.5 before:bg-primary before:shadow-lg",
              "animate-pulse-slow"
            ],
            entry.rank > 3 && "hover:border-primary/30"
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-secondary">
            {getRankIcon(entry.rank)}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className={cn("truncate font-display tracking-wide", 
               entry.user_id === currentUserId ? "font-bold text-foreground" : "font-semibold text-foreground/90")}>
              {entry.display_name}
              {entry.user_id === currentUserId && (
                <span className="ml-2 text-xs font-medium bg-primary/20 text-primary px-2.5 py-0.5 rounded-full border border-primary/30">
                  You
                </span>
              )}
            </h4>
            <p className="text-sm text-muted-foreground">
              {entry.problems_solved} solved
            </p>
          </div>

          {entry.current_streak > 0 && (
            <div className="flex items-center gap-1 text-primary">
              <Star className="w-4 h-4 fill-primary" />
              <span className="font-semibold text-sm">{entry.current_streak}</span>
            </div>
          )}

          <div className="text-right">
            <span className="text-xl font-bold text-gradient font-display">
              {entry.total_points}
            </span>
            <p className="text-xs text-muted-foreground">pts</p>
          </div>
        </div>
      ))}
    </div>
  );
}
