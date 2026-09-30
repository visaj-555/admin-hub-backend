export const generateEmailTemplate = (
  subject: string,
  message: string,
): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      font-family: Arial, sans-serif;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: #309d81;
      padding: 30px 20px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      margin: 0 0 20px;
      color: #333333;
      font-size: 20px;
      font-weight: 600;
    }
    .content p {
      color: #555555;
      font-size: 16px;
      line-height: 1.6;
      margin: 0 0 15px;
    }
    .footer {
      background: #f9f9f9;
      padding: 20px;
      text-align: center;
      color: #888888;
      font-size: 13px;
      border-top: 1px solid #eeeeee;
    }
    .footer a {
      color: #4f46e5;
      text-decoration: none;
    }
    
    @media (max-width: 600px) {
      .container {
        margin: 20px;
      }
      .content {
        padding: 30px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BANK AND DEFICIT</h1>
    </div>
    
    <div class="content">
      <h2>${subject}</h2>
      <p>${message}</p>
    </div>
    
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} BANK AND DEFICIT. All rights reserved.</p>
      <p>
        <a href="#">Contact Us</a> &nbsp;|&nbsp; <a href="#">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
`;
