const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const data = JSON.parse(event.body);

  // Configure the email transport using Environment Variables
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, 
      pass: process.env.GMAIL_APP_PASSWORD 
    }
  });

  let mailOptions = {
    from: `"Studio Name" <${process.env.GMAIL_USER}>`,
    to: data.email,
    subject: `Job Receipt: #${data.jobId}`,
    html: `
      <h1>Job Confirmation</h1>
      <p>Hi ${data.name}, thanks for visiting!</p>
      <p><strong>Job ID:</strong> ${data.jobId}</p>
      <p><strong>Sizes:</strong> ${data.sizes}</p>
      <p><strong>Total Cost:</strong> LKR ${data.cost}</p>
      <br />
      <p>Please show this email to collect your photos.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { statusCode: 200, body: "Email Sent" };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};