import asyncHandler from "../../common/utils/asyncHandler.js";
import {
    createEmployeeSchema,
    updateEmployeeSchema,
    employeeListSchema
} from "./employee.validation.js";

import {
    createEmployeeService,
    getEmployeeService,
    listEmployeesService,
    updateEmployeeService,
    deleteEmployeeService
} from "./employee.service.js";

export const createEmployee = asyncHandler(
    async (req, res) => {
        const data =
            createEmployeeSchema.parse(req.body);

        const employee =
            await createEmployeeService({
                companyId: req.tenant.id,
                data
            });

        return res.status(201).json({
            success: true,
            message: "Employee created successfully",
            data: employee
        });
    }
);

export const listEmployees = asyncHandler(
    async (req, res) => {
        const query =
            employeeListSchema.parse(req.query);

        const result =
            await listEmployeesService({
                companyId: req.tenant.id,
                query
            });

        return res.status(200).json({
            success: true,
            message: "Employees retrieved successfully",
            data: result.items,
            pagination: result.pagination
        });
    }
);

export const getEmployee = asyncHandler(
    async (req, res) => {
        const employee =
            await getEmployeeService({
                employeeId: req.params.id,
                companyId: req.tenant.id
            });

        return res.status(200).json({
            success: true,
            message: "Employee retrieved successfully",
            data: employee
        });
    }
);

export const updateEmployee = asyncHandler(
    async (req, res) => {
        const data =
            updateEmployeeSchema.parse(req.body);

        const employee =
            await updateEmployeeService({
                employeeId: req.params.id,
                companyId: req.tenant.id,
                data
            });

        return res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: employee
        });
    }
);

export const deleteEmployee = asyncHandler(
    async (req, res) => {
        await deleteEmployeeService({
            employeeId: req.params.id,
            companyId: req.tenant.id
        });

        return res.status(200).json({
            success: true,
            message: "Employee deleted successfully"
        });
    }
);