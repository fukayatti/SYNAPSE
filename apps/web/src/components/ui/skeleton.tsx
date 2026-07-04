import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("bg-muted animate-pulse border-[1px] border-border", className)}
			{...props}
		/>
	);
}

export { Skeleton };
