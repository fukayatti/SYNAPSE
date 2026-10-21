import { PRODUCT_NAME } from "@fesflow/config";

type BrandLogoSize = "small" | "medium" | "large" | "hero";

const sizeStyles: Record<BrandLogoSize, { image: string; lockup: string }> = {
	small: { image: "h-8 w-8", lockup: "gap-2 text-sm" },
	medium: { image: "h-10 w-10", lockup: "gap-2 text-base" },
	large: { image: "h-16 w-16", lockup: "gap-3 text-2xl" },
	hero: {
		image: "h-20 w-20 sm:h-28 sm:w-28",
		lockup: "gap-3 text-4xl sm:gap-5 sm:text-6xl md:text-8xl",
	},
};

// 2026-10-22: Match the visitor header's Space Mono wordmark; allow landing pages to opt into a lighter face.
export default function BrandLogo({
	size = "medium",
	weight = "bold",
	className = "",
}: {
	size?: BrandLogoSize;
	weight?: "bold" | "light";
	className?: string;
}) {
	const style = sizeStyles[size];
	const wordmarkWeight = weight === "light" ? "font-body font-light" : "font-mono font-black";

	return (
		<span className={`inline-flex shrink-0 items-center whitespace-nowrap uppercase leading-none tracking-[2px] ${style.lockup} ${wordmarkWeight} ${className}`}>
			<img
				src="/favicon/web-app-manifest-512x512-inverse.png"
				alt=""
				aria-hidden="true"
				className={`block shrink-0 object-contain dark:hidden ${style.image}`}
				decoding="async"
			/>
			<img
				src="/favicon/web-app-manifest-512x512.png"
				alt=""
				aria-hidden="true"
				className={`hidden shrink-0 object-contain dark:block ${style.image}`}
				decoding="async"
			/>
			<span>{PRODUCT_NAME.toUpperCase()}</span>
		</span>
	);
}
