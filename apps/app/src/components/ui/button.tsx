import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	// 2026-10-21: 長いラベルでボタンや親レイアウトが横に膨らまないよう、縮小と折り返しを許可する。
	"inline-flex min-w-0 max-w-full items-center justify-center gap-2 whitespace-normal break-words text-center leading-snug font-headline uppercase tracking-[2px] transition-all disabled:pointer-events-none disabled:bg-muted disabled:border-muted disabled:text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info active:border-heavy active:bg-primary active:text-primary-foreground",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground border-border border-thick hover:bg-background hover:text-foreground",
				destructive:
					"bg-destructive text-destructive-foreground border-border border-thick hover:bg-primary hover:text-destructive",
				outline:
					"bg-background text-foreground border-border border-thick hover:bg-primary hover:text-primary-foreground",
				secondary:
					"bg-secondary text-secondary-foreground border-border border-thick hover:bg-primary hover:text-primary-foreground",
				accent:
					"bg-accent text-accent-foreground border-border border-thick hover:brightness-110",
				ghost:
					"bg-transparent text-foreground border-transparent underline hover:text-info active:border-transparent active:no-underline",
				link: "text-info underline underline-offset-4 border-transparent",
			},
			size: {
				default: "min-h-[44px] py-2 px-[24px] text-[14px]",
				sm: "min-h-[32px] py-1 px-[16px] text-[12px]",
				lg: "min-h-[56px] py-3 px-[40px] text-[18px]",
				icon: "size-[44px]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? SlotPrimitive.Slot : "button";

	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
