import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap font-headline uppercase tracking-[2px] transition-all disabled:pointer-events-none disabled:bg-muted disabled:border-muted disabled:text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-0 active:border-heavy active:bg-primary active:text-primary-foreground",
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
				link: "text-info underline-offset-4 hover:underline border-transparent",
			},
			size: {
				default: "h-[44px] px-[24px] text-[14px]",
				sm: "h-[32px] px-[16px] text-[12px]",
				lg: "h-[56px] px-[40px] text-[18px]",
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
