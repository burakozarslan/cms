import type { HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return <div className={`card ${className}`.trim()} {...props} />;
}

export function CardHeader({ className = "", ...props }: CardProps) {
  return <div className={`card-header ${className}`.trim()} {...props} />;
}

export function CardBody({ className = "", ...props }: CardProps) {
  return <div className={`card-body ${className}`.trim()} {...props} />;
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`card-title ${className}`.trim()} {...props} />;
}

export function CardFooter({ className = "", ...props }: CardProps) {
  return <div className={`card-footer ${className}`.trim()} {...props} />;
}

export function CardActions({ className = "", ...props }: CardProps) {
  return <div className={`card-actions ${className}`.trim()} {...props} />;
}

