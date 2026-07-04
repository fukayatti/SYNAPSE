
import { useState, Suspense } from "react";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import CircleLoginOnlyForm from "@/components/circle-login-only-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Loader from "@/components/loader";

function LoginContent() {
  const [showSignUp, setShowSignUp] = useState(false);

  if (showSignUp) {
    return <SignUpForm onSwitchToSignIn={() => setShowSignUp(false)} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-sp-3 md:p-sp-5 bg-muted">
      <div className="w-full max-w-lg p-sp-5 bg-background border-[5px] border-border text-foreground">
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="personal">
              個人アカウント
            </TabsTrigger>
            <TabsTrigger value="staff">
              店舗・スタッフ簡易
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal">
            <SignInForm onSwitchToSignUp={() => setShowSignUp(true)} />
          </TabsContent>

          <TabsContent value="staff">
            <CircleLoginOnlyForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loader />}>
      <LoginContent />
    </Suspense>
  );
}
