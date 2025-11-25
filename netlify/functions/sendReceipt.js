const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const data = JSON.parse(event.body);

  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  let mailOptions = {
    from: `"Studio Click" <${process.env.GMAIL_USER}>`,
    to: data.email,
  };

  // --- LOGIC: CHECK EMAIL TYPE ---
  if (data.type === 'READY_NOTIFY') {
    mailOptions.subject = `Good News! Job ${data.jobId} is Ready`;
    mailOptions.html = `
      <h2>Hello ${data.name},</h2>
      <p>Your photo job <strong>${data.jobId}</strong> is ready for collection!</p>
      <p>Please bring your receipt when you come to collect.</p>
      <br/><p>Studio Click Team</p>
    `;
  } else {
    // Standard Receipt (Default)
    mailOptions.subject = `Receipt for Job #${data.jobId}`;
    mailOptions.html = `<h2>Receipt Attached</h2><p>Thank you for your business.</p>`;
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
    return { statusCode: 500, body: error.toString() };
  }
};