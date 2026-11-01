import { createRoot } from "react-dom/client";
import "@fontsource-variable/public-sans";
import "./styles.css";
import App from "./App.jsx";
import { MotionRoot } from "./ez/motion";

createRoot(document.getElementById("root")).render(
	<MotionRoot>
		<App />
	</MotionRoot>,
);
