import axios from "axios";
import { getGraphAccessToken } from "./msGraphAuth.js";

export const createTeamsMeeting = async ({
  subject,
  startDateTime,
  endDateTime,
  attendeesEmails = [],
}) => {
  const token = await getGraphAccessToken();
  const normalizedAttendees = [...new Set(attendeesEmails.filter(Boolean))];

  const response = await axios.post(
    `https://graph.microsoft.com/v1.0/users/${process.env.TEAMS_ORGANIZER_EMAIL}/calendar/events`,
    {
      subject,
      start: { dateTime: startDateTime, timeZone: "Asia/Kolkata" },
      end: { dateTime: endDateTime, timeZone: "Asia/Kolkata" },
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      attendees: normalizedAttendees.map(email => ({
        emailAddress: { address: email },
        type: "required",
      })),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.timezone="Asia/Kolkata"',
      },
    }
  );

  // console.log("🔗 Teams Link:", response.data.onlineMeeting?.joinUrl);

  return response.data.onlineMeeting?.joinUrl;
};

// export const createTeamsMeeting = async ({
//   subject,
//   startDateTime,
//   endDateTime,
//   attendeesEmails = [],
// }) => {
//   const token = await getGraphAccessToken();

//   const eventPayload = {
//     subject,
//     start: {
//       dateTime: startDateTime,
//       timeZone: "Asia/Kolkata",
//     },
//     end: {
//       dateTime: endDateTime,
//       timeZone: "Asia/Kolkata",
//     },
//     isOnlineMeeting: true,
//     onlineMeetingProvider: "teamsForBusiness",
//     attendees: attendeesEmails.map(email => ({
//       emailAddress: { address: email },
//       type: "required",
//     })),
//   };

//   const response = await axios.post(
//     `https://graph.microsoft.com/v1.0/users/${process.env.TEAMS_ORGANIZER_EMAIL}/calendar/events`,
//     eventPayload,
//     { 
//       headers: {
//         Authorization: `Bearer ${token}`,
//         "Content-Type": "application/json",
//         Prefer: 'outlook.timezone="Asia/Kolkata"',
//       },
//     }
//   );
//   console.log(
//   "📦 Graph Event Response:",
//   JSON.stringify(response.data, null, 2)
// );

//   console.log("Teams meeting created:", response.data);
//   console.log("🔗 Teams Join URL:", response.data.onlineMeeting?.joinUrl);
//   return response.data.onlineMeeting.joinUrl;
  
// };
