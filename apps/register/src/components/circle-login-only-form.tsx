
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { eventApi, membershipApi, circleApi, type Event, type Circle } from "@/lib/api";
import { saveAuthInfo, type RoleType } from "@/hooks/useCircleAuth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";

export default function CircleLoginOnlyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const [events, setEvents] = useState<Event[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedCircleId, setSelectedCircleId] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);

  // PIN認証用
  const [pinEmail, setPinEmail] = useState("");
  const [pin, setPin] = useState("");

  // イベント一覧取得
  useEffect(() => {
    eventApi.list()
      .then((data) => {
        setEvents(data);
        if (data.length > 0 && data[0]) {
          setSelectedEventId(data[0].id);
        }
      })
      .catch((err) => {
        toast.error("イベント一覧の取得に失敗しました");
      });
  }, []);

  // 選択イベントに応じたサークル一覧取得
  useEffect(() => {
    if (!selectedEventId) {
      setCircles([]);
      setSelectedCircleId("");
      return;
    }

    circleApi.list(selectedEventId)
      .then((data) => {
        setCircles(data);
        if (data.length > 0 && data[0]) {
          setSelectedCircleId(data[0].id);
        } else {
          setSelectedCircleId("");
        }
      })
      .catch((err) => {
        toast.error("サークル一覧の取得に失敗しました");
      });
  }, [selectedEventId]);

  // PIN認証
  const authenticateWithPin = useMutation({
    mutationFn: async (input: {
      userEmail: string;
      pin: string;
      circleId: string;
    }) => {
      const result = await membershipApi.authenticateWithPin({
        circleId: input.circleId,
        pin: input.pin,
        email: input.userEmail,
      });
      if (!result.success || !result.membership || !result.user) {
        throw new Error("認証に失敗しました");
      }
      return {
        membershipId: result.membership.id,
        userName: result.user.name,
        role: result.membership.role,
      };
    },
    onSuccess: (data) => {
      const circleName = circles.find((c) => c.id === selectedCircleId)?.name || null;
      // 認証情報を保存
      saveAuthInfo({
        circleId: selectedCircleId,
        eventId: selectedEventId || null,
        userEmail: pinEmail,
        userName: data.userName,
        role: data.role as RoleType,
        membershipId: data.membershipId,
        circleName: circleName,
      });

      toast.success(`${data.userName}さん、ようこそ！`);
      router.push((callbackUrl as any) || "/dashboard");
    },
    onError: (error: any) => {
      toast.error(error.message || "認証に失敗しました");
      setIsLoading(false);
    },
  });

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!selectedCircleId) {
      toast.error("サークルを選択してください");
      setIsLoading(false);
      return;
    }

    try {
      await authenticateWithPin.mutateAsync({
        userEmail: pinEmail,
        pin,
        circleId: selectedCircleId,
      });
    } catch (error) {
      // エラーはonErrorで処理される
    }
  };

  return (
    <div className="mx-auto w-full mt-4">
      <div className="space-y-5">
        {/* イベント選択 */}
        <div className="space-y-2">
          <Label htmlFor="eventSelect" className="block font-headline uppercase text-xs tracking-wider">イベント選択</Label>
          <select
            id="eventSelect"
            className="flex w-full rounded-none border-thick border-border bg-input text-foreground px-3 py-2.5 font-mono text-[15px] transition-all focus:outline-none focus:border-heavy disabled:opacity-50"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="">イベントを選択してください</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.eventName}
              </option>
            ))}
          </select>
        </div>

        {/* サークル選択 */}
        <div className="space-y-2">
          <Label htmlFor="circleSelect" className="block font-headline uppercase text-xs tracking-wider">店舗・サークル選択</Label>
          <select
            id="circleSelect"
            className="flex w-full rounded-none border-thick border-border bg-input text-foreground px-3 py-2.5 font-mono text-[15px] transition-all focus:outline-none focus:border-heavy disabled:opacity-50"
            value={selectedCircleId}
            onChange={(e) => setSelectedCircleId(e.target.value)}
            disabled={!selectedEventId || circles.length === 0}
          >
            <option value="">
              {circles.length === 0 ? "サークルがありません" : "サークルを選択してください"}
            </option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handlePinSubmit} className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label htmlFor="pinEmail" className="block font-headline uppercase text-xs tracking-wider">代表者メールアドレス</Label>
            <Input
              id="pinEmail"
              type="email"
              placeholder="example@email.com"
              value={pinEmail}
              onChange={(e) => setPinEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin" className="block font-headline uppercase text-xs tracking-wider">PIN / 暗証番号</Label>
            <Input
              id="pin"
              type="password"
              placeholder="4-6桁のPINを入力"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="accent" className="w-full h-12 text-base font-headline uppercase tracking-wider" disabled={isLoading || !selectedCircleId}>
            {isLoading ? "認証中..." : "ログイン"}
          </Button>
        </form>
      </div>
    </div>
  );
}
