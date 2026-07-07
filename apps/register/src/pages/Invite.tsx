
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { membershipApi } from "@/lib/api";
import { saveAuthInfo, type RoleType } from "@/hooks/useCircleAuth";
import { authClient } from "@/lib/auth-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Loader from "@/components/loader";
import { CheckCircle, XCircle, UserPlus, LogIn } from "lucide-react";

// 2026-07-07 (Phase 3a/3b): 招待受諾は better-auth セッション必須になった
// (userEmail はセッションから解決されるため入力不要、PIN も廃止)。
// 未ログインでこのページに来た場合は、まず better-auth ログイン/サインアップへ
// 誘導し、ログイン後に招待トークン付きでこのページへ戻ってこられるようにする。
export default function InvitePage() {
  // react-router の動的セグメント /invite/:token から取得 (旧 Next の use(params) を置換)
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [userName, setUserName] = useState("");

  useEffect(() => {
    if (session?.user?.name) {
      setUserName((prev) => prev || session.user.name);
    }
  }, [session]);

  const acceptInviteMutation = useMutation({
    mutationFn: async (input: { token: string; userName: string }) => {
      return await membershipApi.acceptInvite(input);
    },
    onSuccess: (data) => {
      // 認証情報を保存 (circleId 等は次回ログイン時の /api/memberships/my で解決される)
      saveAuthInfo({
        circleId: null,
        eventId: null,
        userEmail: session?.user?.email || null,
        userName: userName || session?.user?.name || null,
        role: "circle_staff" as RoleType,
        membershipId: data.membershipId,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate("/circle/dashboard");
      }, 2000);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    acceptInviteMutation.mutate({
      token,
      userName: userName.trim(),
    });
  };

  if (sessionPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  // 未ログイン: まず better-auth ログイン/サインアップへ誘導する。
  // callbackUrl で招待受諾ページへ戻ってこられるようにする。
  if (!session) {
    const callbackUrl = encodeURIComponent(`/circle/invite/${token}`);
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>サークルへの招待</CardTitle>
            <CardDescription>
              招待を受け取るには、まずログイン（またはアカウント作成）してください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate(`/circle/login?callbackUrl=${callbackUrl}`)}
            >
              <LogIn className="h-4 w-4 mr-2" />
              ログイン / アカウント作成へ進む
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 mx-auto text-success" />
              <h2 className="text-2xl font-bold">参加完了！</h2>
              <p className="text-muted-foreground">
                サークルへの参加が完了しました。 ダッシュボードへ移動します...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>サークルへの招待</CardTitle>
          <CardDescription>
            {session.user.email} として参加します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">お名前（表示名）</Label>
              <Input
                id="name"
                placeholder="山田太郎"
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={acceptInviteMutation.isPending || !userName.trim()}
            >
              {acceptInviteMutation.isPending ? (
                <>
                  <Loader />
                  <span className="ml-2">参加中...</span>
                </>
              ) : (
                "参加する"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
