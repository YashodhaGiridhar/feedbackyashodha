const sql = require('mssql');

// sanitize text by removing known personal identifiers
function sanitizeText(s) {
    if (!s) return s;

    // remove emails
    s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]');

    // remove URLs
    s = s.replace(/https?:\/\/\S+/gi, '[redacted-url]');

    // remove phone numbers
    s = s.replace(/(\+?\d{1,3}[-.\s]?)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g, '[redacted-phone]');

    return s.trim();
}

module.exports = async function (context, req) {
    context.log("SubmitFeedback function triggered");

    // Validate body
    if (!req.body) {
        context.res = {
            status: 400,
            body: "Invalid body"
        };
        return;
    }

    const { faculty_name, course_code, rating, category, comments } = req.body;

    if (!faculty_name || !course_code || !rating || !category) {
        context.res = {
            status: 400,
            body: "Required fields missing"
        };
        return;
    }

    // Convert & validate rating
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
        context.res = {
            status: 400,
            body: "Rating must be between 1 and 5"
        };
        return;
    }

    // sanitize user fields
    const safeFaculty = sanitizeText(faculty_name).substring(0, 200);
    const safeCourse = sanitizeText(course_code).substring(0, 50);
    const safeCategory = sanitizeText(category).substring(0, 100);
    const safeComments = sanitizeText(comments || "").substring(0, 2000);

    // get SQL connection string from Static Web App configuration
    const connStr = process.env.SqlConnectionString;

    if (!connStr) {
        context.res = {
            status: 500,
            body: "Database connection not configured"
        };
        return;
    }

    try {
        // connect to Azure SQL
        await sql.connect(connStr);

        const query = `
            INSERT INTO Submissions (faculty_name, course_code, rating, category, comments)
            VALUES (@faculty_name, @course_code, @rating, @category, @comments);
        `;

        const request = new sql.Request();
        request.input("faculty_name", sql.NVarChar(200), safeFaculty);
        request.input("course_code", sql.NVarChar(50), safeCourse);
        request.input("rating", sql.TinyInt, r);
        request.input("category", sql.NVarChar(100), safeCategory);
        request.input("comments", sql.NVarChar(sql.MAX), safeComments);

        await request.query(query);

        context.res = {
            status: 200,
            body: "OK"
        };

    } catch (err) {
        context.log("SQL error:", err);

        context.res = {
            status: 500,
            body: "Server error"
        };
    } finally {
        try { sql.close(); } catch (e) {}
    }
};