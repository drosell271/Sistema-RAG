import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils"; // Assuming you have a utils file for clsx/tailwind-merge
import { Loader2 } from "lucide-react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "destructive" | "ghost" | "outline";
	size?: "sm" | "md" | "lg" | "icon";
	isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant = "primary",
			size = "md",
			isLoading,
			children,
			disabled,
			...props
		},
		ref,
	) => {
		const baseStyles =
			"inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

		const variants = {
			primary:
				"bg-primary-500 text-white hover:bg-primary-600 focus-visible:ring-primary-500 shadow-sm",
			secondary:
				"bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700",
			destructive:
				"bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 shadow-sm",
			ghost: "hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-50",
			outline:
				"border border-gray-200 bg-transparent hover:bg-gray-100 text-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800",
		};

		const sizes = {
			sm: "h-8 px-3 text-xs",
			md: "h-10 px-4 py-2 text-sm",
			lg: "h-12 px-8 text-md",
			icon: "h-10 w-10",
		};

		return (
			<button
				ref={ref}
				className={cn(
					baseStyles,
					variants[variant],
					sizes[size],
					className,
				)}
				disabled={disabled || isLoading}
				{...props}
			>
				{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
				{children}
			</button>
		);
	},
);

Button.displayName = "Button";

export default Button;
