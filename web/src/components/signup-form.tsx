import { useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface SignupFormValues {
  username: string;
  password: string;
}

interface SignupFormProps extends Omit<React.ComponentProps<"div">, "onSubmit"> {
  onSubmit: (values: SignupFormValues) => void;
  pending?: boolean;
  error?: string | null;
}

export function SignupForm({
  className,
  onSubmit,
  pending = false,
  error = null,
  ...props
}: SignupFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password !== confirmPassword) {
      setLocalError("两次输入的密码不一致");
      return;
    }
    setLocalError(null);
    onSubmit({ username: username.trim(), password });
  }

  const displayError = localError ?? error;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Enter your username and password to create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <FieldDescription>
                  Must be at least 8 characters long.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">
                  Confirm Password
                </FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </Field>
              {displayError && <FieldError>{displayError}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating account…" : "Create Account"}
                </Button>
                <FieldDescription className="text-center">
                  Already have an account?{" "}
                  <Link
                    to="/login"
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    Sign in
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
