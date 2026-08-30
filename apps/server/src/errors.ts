export class ForbiddenError extends Error {
	constructor(message = "You do not have access to this resource") {
		super(message);
		this.name = "ForbiddenError";
	}
}

export class NotFoundError extends Error {
	constructor(message = "Resource not found") {
		super(message);
		this.name = "NotFoundError";
	}
}

export class ConflictError extends Error {
	constructor(message = "The request conflicts with the current state") {
		super(message);
		this.name = "ConflictError";
	}
}

export class BadRequestError extends Error {
	constructor(message = "The request is invalid") {
		super(message);
		this.name = "BadRequestError";
	}
}
