import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    checkIn: Date,
    checkOut: Date,
    status: {
      type: String,
      enum: ["PRESENT", "LATE", "ABSENT"],
      required: true,
    },
    workingHours: {
      type: Number,
      default: 0,
    },
    dayType: {
      type: String,
      enum: ["Full Day", "Three Quarter Day", "Half Day", "Short Day"],
    },
  },
  { timestamps: true },
);

const Attendance =
  mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

export default Attendance;
