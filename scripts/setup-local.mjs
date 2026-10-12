import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";

try {
  await copyFile(".env.example", ".env.local", constants.COPYFILE_EXCL);
  console.log(
    "Created .env.local. Fill in your local GitHub and journal settings before starting the app.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env.local already exists; your settings were preserved.");
}
