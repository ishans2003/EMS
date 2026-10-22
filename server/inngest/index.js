import { Inngest } from "inngest";
import Attendance from "../models/Attendance.js";
import Employee from "../models/Employee.js";
import LeaveApplication from "../models/LeaveApplication.js";
import sendEmail from "../config/nodemailer.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "EMS" });

// Auto check-out for employees who do not manually check out.
const autoCheckOut = inngest.createFunction(
  { id: "auto-check-out", triggers: [{ event: "employee/check-out" }] },
  async ({ event, step }) => {
    const { employeeId, attendanceId } = event.data ?? {};
    if (!employeeId || !attendanceId) {
      throw new Error("employee/check-out requires employeeId and attendanceId");
    }

    await step.sleepUntil(
      "wait-for-the-9-hours",
      new Date(Date.now() + 9 * 60 * 60 * 1000),
    );

    let attendance = await Attendance.findById(attendanceId);
    if (!attendance || attendance.checkOut) {
      return { status: "already-checked-out-or-missing" };
    }

    const employee = await Employee.findById(employeeId);
    if (employee?.email) {
      await step.run("send-checkout-reminder", () =>
        sendEmail({
          to: employee.email,
          subject: "Attendance Check-Out Reminder",
          body: `<div style="max-width: 600px;">
            <h2>Hi ${employee.firstName}, 👋</h2>
            <p style="font-size: 16px;">You have a check-in in ${employee.department} today:</p>
            <p style="font-size: 18px; font-weight: bold; color: #007bff; margin: 8px 0;">${attendance.checkIn?.toLocaleTimeString()}</p>
            <p style="font-size: 16px;">Please make sure to check out within one hour.</p>
            <p style="font-size: 16px;">If you have any questions, please contact your admin.</p>
            <p style="font-size: 16px;">Best Regards,<br />EMS</p>
          </div>`,
        }),
      );
    }

    await step.sleepUntil("wait-for-1-hour", new Date(Date.now() + 60 * 60 * 1000));

    attendance = await Attendance.findById(attendanceId);
    if (!attendance || attendance.checkOut) return { status: "checked-out" };

    // Credit a half day and set the scheduled four-hour check-out time.
    const checkOut = new Date(new Date(attendance.checkIn).getTime() + 4 * 60 * 60 * 1000);
    const result = await Attendance.updateOne(
      { _id: attendanceId, checkOut: null },
      { $set: { checkOut, workingHours: 4, dayType: "Half Day", status: "LATE" } },
    );
    return { status: result.modifiedCount ? "auto-checked-out" : "checked-out" };
  },
);
//send email to admin, if admin does't take action on leave application within 24 hours
const leaveApplicationReminder = inngest.createFunction(
  { id: "leave-application-reminder", triggers:[{ event: "leave/pending" }] },
  
  async ({ event, step }) => {
    const { leaveApplicationId } = event.data ?? {};
    if (!leaveApplicationId) {
      throw new Error("leave/pending requires leaveApplicationId");
    }

    //wait for 24 hours
    await step.sleepUntil(
      "wait-for-24-hours",
      new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
    );

    const leaveApplication =
      await LeaveApplication.findById(leaveApplicationId);
    if (leaveApplication?.status === "PENDING") {
      const employee = await Employee.findById(leaveApplication.employeeId);
      if (!employee) return { status: "employee-missing" };
      if (!process.env.ADMIN_EMAIL) throw new Error("ADMIN_EMAIL is not configured");

      //Send reminder email to admin to take action on leave application
      await step.run("send-leave-reminder", () => sendEmail({
        to:process.env.ADMIN_EMAIL,
        subject: `Leave Application Reminder`,
        body: `<div style="max-width: 600px;">
                <h2>Hi Admin, 👋</h2>
                <p style="font-size: 16px;">You have a leave application in ${employee.department} today:</p>
                <p style="font-size: 18px; font-weight: bold; color: #007bff; margin: 8px 0;">${leaveApplication?.startDate?.toLocaleDateString()}</p>
                <p style="font-size: 16px;">Please make sure to take action on this leave application.</p>
                <br />
                <p style="font-size: 16px;">Best Regards,</p>
                <p style="font-size: 16px;">EMS</p>
            </div>`
      }));
      return { status: "reminder-sent" };
    }
    return { status: "no-longer-pending" };
  },
);

// Cron: Check attendance at 11:30 AM IST and email employees who have not checked in.
const attendanceReminderCron = inngest.createFunction(
  { id: "attendance-reminder-cron", triggers: [{ cron: "TZ=Asia/Kolkata 30 11 * * *" }] },
  async ({ step }) => {
    // Calculate midnight in India, then use a half-open UTC range for MongoDB.
    const today = await step.run("get-today-date", () => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
      const startUTC = new Date(
        Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day)) -
          330 * 60 * 1000,
      );
      const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
      return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() };
    });

    //get all active, non-deleted employees
    const activeEmployees = await step.run("get-active-employees", async () => {
      const employees = await Employee.find({
        isDeleted: false,
        employmentStatus: "ACTIVE",
      }).lean();
      return employees.map((e) => ({
        id: e._id.toString(),
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        department: e.department,
      }));
    });
    // Get employees on approved leave during any part of today.
    const onLeaveIds = await step.run("get-on-leave-ids", async () => {
      const leaves = await LeaveApplication.find({
        status: "APPROVED",
        startDate: { $lt: new Date(today.endUTC) },
        endDate: { $gte: new Date(today.startUTC) },
      }).lean();
      return [...new Set(leaves.map((leave) => leave.employeeId.toString()))];
    });

    // Only attendance records with a check-in should suppress the reminder.
    const checkedInIds = await step.run("get-checked-in-ids", async () => {
      const attendances = await Attendance.find({
        date: { $gte: new Date(today.startUTC), $lt: new Date(today.endUTC) },
        checkIn: { $exists: true, $ne: null },
      }).lean();
      return [...new Set(attendances.map((attendance) => attendance.employeeId.toString()))];
    });

    // Filter employees who are neither on approved leave nor checked in.
    const absentEmployees = activeEmployees.filter(
      (employee) => !onLeaveIds.includes(employee.id) && !checkedInIds.includes(employee.id),
    );

    if (absentEmployees.length > 0) {
      await Promise.all(
        absentEmployees.map((employee) =>
          step.run(`send-reminder-${employee.id}`, () =>
            sendEmail({
              to: employee.email,
              subject: "Attendance Reminder - Please Mark Your Attendance",
              body: `<div style="max-width: 600px; font-family: Arial, sans-serif;">
                <h2>Hi ${employee.firstName}, 👋</h2>
                <p style="font-size: 16px;">We noticed you haven't marked your attendance yet today.</p>
                <p style="font-size: 16px;">The deadline was <strong>11:30 AM</strong> and your attendance is still missing.</p>
                <p style="font-size: 16px;">Please check in as soon as possible or contact your admin if you're facing any issues.</p>
                <p style="font-size: 14px; color: #666;">Department: ${employee.department}</p>
                <p style="font-size: 16px;">Best Regards,<br /><strong>QuickEMS</strong></p>
              </div>`,
            }),
          ),
        ),
      );
    }

    return {
      totalActive: activeEmployees.length,
      onLeave: onLeaveIds.length,
      checkedIn: checkedInIds.length,
      absent: absentEmployees.length,
    };
  },
);

// Create an empty array where we'll export future Inngest functions
export const functions = [autoCheckOut, leaveApplicationReminder, attendanceReminderCron];
