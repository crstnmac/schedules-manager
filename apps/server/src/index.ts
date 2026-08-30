import { createApp } from "./app";

createApp().listen({ port: 3000, hostname: "0.0.0.0" }, () => {
	console.log("Server is running on http://0.0.0.0:3000");
	console.log(
		"OpenAPI documentation is available at http://localhost:3000/openapi",
	);
});
