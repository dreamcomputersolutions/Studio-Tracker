const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  const data = JSON.parse(event.body);

  // --- CRITICAL UPDATE: Check if email exists ---
  if (!data.email || data.email.trim() === "") {
    console.log("No email provided for job " + data.jobId + ". Skipping email sending.");
    return { statusCode: 200, body: "Skipped (No Email)" };
  }

  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  let mailOptions = {
    from: `"Studio Click" <${process.env.GMAIL_USER}>`,
    to: data.email,
  };

  // 1. READY NOTIFICATION
  if (data.type === 'READY_NOTIFY') {
    mailOptions.subject = `Job ${data.jobId} is Ready! - Studio Click`;
    mailOptions.html = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Hello ${data.name},</h2>
        <p>Your photo job <strong>${data.jobId}</strong> is completed and ready for collection.</p>
        <p>Please visit the studio to pick up your items.</p>
        <br/>
        <p>Regards,<br/>Studio Click Team</p>
      </div>
    `;
  } 
  // 2. INITIAL RECEIPT / UPDATE
  else if (data.type === 'JOB_UPDATED') {
    mailOptions.subject = `Job Confirmation: #${data.jobId} - Studio Click`;
    mailOptions.html = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Job Confirmed</h2>
        <p>Hi ${data.name},</p>
        <p>Thank you for your order. Your job <strong>${data.jobId}</strong> has been processed.</p>
        <p>Please find your receipt attached.</p>
      </div>
    `;
    mailOptions.attachments = [{
      filename: `Receipt-${data.jobId}.pdf`,
      content: data.pdfBase64,
      encoding: 'base64'
    }];
  } 
  // 3. FINAL RECEIPT
  else {
    mailOptions.subject = `Receipt for Job #${data.jobId}`;
    mailOptions.html = `<h2>Receipt Attached</h2><p>Thank you!</p>`;
    mailOptions.attachments = [{
      filename: `Receipt-${data.jobId}.pdf`,
      content: data.pdfBase64,
      encoding: 'base64'
    }];
  }

  try {
    await transporter.sendMail(mailOptions);
    return { statusCode: 200, body: "Sent" };
  } catch (error) {
    console.error("Email Error:", error);
    return { statusCode: 500, body: error.toString() };
  }
};