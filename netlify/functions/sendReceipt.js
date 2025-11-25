const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const data = JSON.parse(event.body);

  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, 
      pass: process.env.GMAIL_APP_PASSWORD 
    }
  });

  let mailOptions = {
    from: `"Studio Click" <${process.env.GMAIL_USER}>`,
    to: data.email,
    subject: `Receipt for Job #${data.jobId}`,
    html: `
      <h2>Thank you for visiting Studio Click!</h2>
      <p>Your job <strong>${data.jobId}</strong> has been completed.</p>
      <p>Please find your official receipt attached.</p>
      <br/>
      <p>Regards,<br/>Studio Click Team</p>
    `,
    attachments: [
      {
        filename: `Receipt-${data.jobId}.pdf`,
        content: data.pdfBase64, // We will send this from the frontend
        encoding: 'base64'
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
    return { statusCode: 200, body: "Email Sent" };
  } catch (error) {
    console.error("Email Error:", error);
    return { statusCode: 500, body: error.toString() };
  }
};