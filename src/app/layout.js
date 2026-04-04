import "./globals.css";
import { KycProvider } from "@/context/KycContext";

export const metadata = {
  title: "KBS - Vendor KYC System",
  description: "KBS Vendor KYC Management Portal",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <KycProvider>{children}</KycProvider>
      </body>
    </html>
  );
}
