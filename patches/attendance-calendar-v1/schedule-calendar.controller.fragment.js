export const getAttendanceCalendar = async (req, res) => {
    const result = await scheduleService.getAttendanceCalendar(
        getCompanyId(req),
        req.query,
    );
    return res.status(200).json({
        success: true,
        data: result,
    });
};
