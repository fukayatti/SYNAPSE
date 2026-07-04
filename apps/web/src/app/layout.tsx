import type { Metadata } from "next";
import { Archivo_Black, Work_Sans, Space_Mono } from "next/font/google";
import "../index.css";
import Providers from "@/components/providers";
import Header from "@/components/header";

const archivoBlack = Archivo_Black({
	variable: "--font-archivo-black",
	subsets: ["latin"],
	weight: "400",
});

const workSans = Work_Sans({
	variable: "--font-work-sans",
	subsets: ["latin"],
	weight: ["400", "600"],
});

const spaceMono = Space_Mono({
	variable: "--font-space-mono",
	subsets: ["latin"],
	weight: "400",
});

export const metadata: Metadata = {
	title: "FesOrder // 学園祭注文システム",
	description: "学園祭での注文管理を、もっとスマートに、もっとスムーズに。リアルタイムPOS/KITCHENソリューション。",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ja" suppressHydrationWarning>
			<body
				className={`${archivoBlack.variable} ${workSans.variable} ${spaceMono.variable} font-body antialiased bg-background text-foreground`}
			>
				<Providers>
					<div className="grid grid-rows-[auto_1fr] min-h-svh">
						<Header />
						<main>{children}</main>
					</div>
				</Providers>
			</body>
		</html>
	);
}
