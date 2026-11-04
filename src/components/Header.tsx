import { Home, LogIn, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const LMC_HOME_URL = "https://lincoln-math-competition-website.vercel.app/";

interface HeaderProps {
  user?: { email: string } | null;
  onLogout?: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="bg-primary text-primary-foreground border-b-4 border-foreground/80 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <a
            href={LMC_HOME_URL}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            title="Lincoln Math Competition home"
          >
            <div className="w-10 h-10 rounded-md bg-white flex items-center justify-center overflow-hidden">
              <img src="/lynx-logo.png" alt="Lincoln Lynx Logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight text-primary-foreground">
                Lincoln Math Competition
              </h1>
              <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/80">Problem of the Week</p>
            </div>
          </a>

          <div className="flex items-center gap-3">
            <Button variant="inverse" size="sm" asChild>
              <a href={LMC_HOME_URL}>
                <Home className="w-4 h-4 mr-1" />
                LMC Home
              </a>
            </Button>
            {user ? (
              <>
                <span className="text-sm text-primary-foreground/85 hidden sm:block">
                  <User className="w-4 h-4 inline mr-1" />
                  {user.email}
                </span>
                <Button variant="inverse" size="sm" onClick={onLogout}>
                  <LogOut className="w-4 h-4 mr-1" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="inverse" size="sm" asChild>
                  <Link to="/auth">
                    <LogIn className="w-4 h-4 mr-1" />
                    Login
                  </Link>
                </Button>
                <Button variant="inverse" size="sm" asChild>
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
