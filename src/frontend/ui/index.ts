/**
 * The `@frontend/ui` boundary.
 *
 * FlyonUI semantic classes and any direct FlyonUI imports belong in this folder
 * only. App pages and components import from `@frontend/ui`, never from
 * `flyonui` directly — see the eslint `no-restricted-imports` rule.
 */
export { Button } from "./button";
export type { ButtonProps } from "./button";

export { Input } from "./input";
export type { InputProps } from "./input";

export { Card, CardHeader, CardBody, CardTitle, CardFooter, CardActions } from "./card";
export type { CardProps } from "./card";

export { Alert } from "./alert";
export type { AlertProps } from "./alert";
