import express from "express"
import cors from "cors"
import "dotenv/config"
import multer from "multer"
import connectDB from "./config/db.js"
import authRouter from "./routes/authRoutes.js"
import employeeRouter from "./routes/employeeRoutes.js"
import profileRouter from "./routes/profileRoutes.js"
import attendanceRouter from "./routes/attendanceRoutes.js"
import leaveRouter from "./routes/leaveRoutes.js"
import payslipRouter from "./routes/payslipsRoutes.js"
import dashboardRouter from "./routes/dashboardRoutes.js"

import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js"
import { fileURLToPath } from "node:url"


const app = express()
const PORT = process.env.PORT || 4000;

//middleware
app.use(cors())
app.use(express.json())
app.use(multer().none())


//routes
app.get("/", (req, res) => res.status(200).send("Server is running"))
app.use("/api/auth",authRouter)
app.use("/api/employees",employeeRouter)
app.use("/api/profile",profileRouter)
app.use("/api/attendance",attendanceRouter)
app.use("/api/leave",leaveRouter)
app.use("/api/payslips",payslipRouter)
app.use("/api/dashboard",dashboardRouter)

app.use("/api/inngest", serve({ client: inngest, functions }));







// Vercel invokes the exported Express app as a serverless function; opening a
// listening socket there prevents the function from serving requests correctly.
await connectDB();

if (process.env.VERCEL !== "1" && process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app
