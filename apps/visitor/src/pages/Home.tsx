import { Link } from "react-router-dom";
import { QrCode, UtensilsCrossed, Sparkles } from "lucide-react";
import { PRODUCT_NAME } from "@fesflow/config";
import { useVisitor } from "@/hooks/useVisitor";

/**
 * 来場者アプリのランディング (2026-07-04)。
 * 通常はリストバンドQR (/w/:id) から入場するが、直接アクセスした場合の案内も置く。
 */
export default function Home() {
  const { isEntered } = useVisitor();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 font-mono">
      <div className="border-[3px] border-border p-8 space-y-6">
        <div className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            {PRODUCT_NAME.toUpperCase()} // VISITOR
          </span>
          <h1 className="font-headline text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight">
            学園祭をもっと楽しむ
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            リストバンドのQRコードを読み取ると入場できます。スタンプラリー・事前注文・抽選が、
            リストバンド1つで楽しめます。
          </p>
        </div>

        <div className="grid gap-3">
          <Feature icon={QrCode} title="リストバンドで入場" desc="配布されたリストバンドのQRを読み取ってください。" />
          <Feature icon={UtensilsCrossed} title="事前注文" desc="メニューを見て、並ばずに事前注文。" />
          <Feature icon={Sparkles} title="スタンプ & 抽選" desc="お店を巡ってスタンプを集めて抽選に応募。" />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          {isEntered ? (
            <Link
              to="/mypage"
              className="border-[2px] border-border bg-primary text-primary-foreground px-5 py-3 text-sm font-black uppercase hover:opacity-90"
            >
              マイページを開く
            </Link>
          ) : (
            <Link
              to="/menu"
              className="border-[2px] border-border bg-primary text-primary-foreground px-5 py-3 text-sm font-black uppercase hover:opacity-90"
            >
              メニューを見る
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 border-[2px] border-border p-3">
      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-black">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
