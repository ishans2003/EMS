import mongoose from "mongoose";
import { DEPARTMENTS } from "../constants/departments.js";

const employeeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      require: true,
      unique: true,
    },
    firstName: {
      type: String,
      require: true,
    },
    lastName: {
      type: String,
      require: true,
    },
    email: {
      type: String,
      require: true,
    },
    phone: {
      type: String,
      require: true,
    },
    position: {
      type: String,
      require: true,
    },
    basicSalary: {
      type: Number,
      default: 0,
    },
    allowances: {
      type: Number,
      default: 0,
    },
    deductions: {
      type: Number,
      default: 0,
    },
    employmentStatus: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    joinDate: {
      type: Date,
      require: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
     bio: {
      type: String,
      default:"",
    },
    department:{
        type:String,
        enum:DEPARTMENTS
    }
  },
  { timestamps: true },
);

const Employee =
  mongoose.models.Employee || mongoose.model("Employee", employeeSchema);
export default Employee;
