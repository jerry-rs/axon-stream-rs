import { Link, useNavigate } from "react-router";
import { useAuthContext } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, Video } from "lucide-react"

export function Nav() {
  const { logout } = useAuthContext();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav className="flex h-14 items-center gap-4 bg-background px-3">
      <Link to="/" className="flex items-center gap-2 text-base font-semibold">
        <Video className="size-10" />
        <span className="font-semibold text-lg">Axon Stream</span>
      </Link>

      <div className="flex flex-1 items-center gap-4" />

      <Button
        variant="outline"
        size="sm"
        onClick={handleLogout}
      >
        <LogOut className="mr-1 size-4" />
        Logout
      </Button>
    </nav>
  );
}
