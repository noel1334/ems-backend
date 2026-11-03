// src/modules/attendance/attendance.constants.js

export const ATTENDANCE_STATUS = Object.freeze({
    PRESENT: "PRESENT",
    LATE: "LATE",
    ABSENT: "ABSENT",
    HALF_DAY: "HALF_DAY",
    ON_LEAVE: "ON_LEAVE",
    HOLIDAY: "HOLIDAY",
    REST_DAY: "REST_DAY",
    INCOMPLETE: "INCOMPLETE",
    CORRECTED: "CORRECTED",
});

export const APPROVAL_STATUS = Object.freeze({
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
});

export const ATTENDANCE_EVENT = Object.freeze({
    CHECK_IN: "CHECK_IN",
    CHECK_OUT: "CHECK_OUT",
    BREAK_START: "BREAK_START",
    BREAK_END: "BREAK_END",
    CORRECTION: "CORRECTION",
});

export const ATTENDANCE_SOURCE = Object.freeze({
    WEB: "WEB",
    MOBILE: "MOBILE",
    ADMIN: "ADMIN",
    HR: "HR",
    TERMINAL: "TERMINAL",
    BIOMETRIC: "BIOMETRIC",
    SYSTEM: "SYSTEM",
});