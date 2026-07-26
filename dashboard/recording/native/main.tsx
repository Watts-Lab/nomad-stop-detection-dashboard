import { createRoot } from "react-dom/client"
import { NativeHomePreview } from "./preview"
import "../../app/globals.css"
import "./recording.css"

createRoot(document.getElementById("root")!).render(<NativeHomePreview />)
