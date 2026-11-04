import { Calculator, LogIn, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface HeaderProps {
  user?: { email: string } | null;
  onLogout?: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden">
              <img src="/lynx-logo.png" alt="LHS Lynx Logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-wider text-foreground">
                LHS Math Club
              </h1>
              <p className="text-xs text-muted-foreground">Problem of the Week</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-muted-foreground hidden sm:block">
                  <User className="w-4 h-4 inline mr-1" />
                  {user.email}
                </span>
                <Button variant="outline" size="sm" onClick={onLogout}>
                  <LogOut className="w-4 h-4 mr-1" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="hero" size="sm" asChild>
                  <Link to="/auth">
                    <LogIn className="w-4 h-4 mr-1" />
                    Login
                  </Link>
                </Button>
                <Button variant="hero" size="sm" asChild>
                  <a
                    href="https://www.awesomemath.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3"
                  >
                    <img src="/AwesomeMath.png" alt="AwesomeMath logo" className="h-8 w-8 rounded-md object-contain" />
                    <span>Proudly sponsored by AwesomeMath</span>
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
