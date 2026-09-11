export type {
	Session as AuthSessionRecord,
	User as AuthUser,
} from "better-auth";
export type {
	AuthClientError,
	EmailSignUpClient,
	EmailSignUpResult,
} from "./sign-up";
export {
	AuthSignUpError,
	DUPLICATE_EMAIL_MESSAGE,
	normalizeAuthSignUpError,
	signUpWithEmail,
} from "./sign-up";
