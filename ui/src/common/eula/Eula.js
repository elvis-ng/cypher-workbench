import React, { useState } from "react";
import { getAuth } from "../../auth/authUtil";
import { doRedirect } from "../../auth/history";
import { Button, Radio, Snackbar } from "@material-ui/core";
import Wrapper from "../Wrapper";
import { decryptV1 } from "../encryption";

const decipherPayload = (payload) => {
  if (payload) {
    try {
      const decoded = decodeURIComponent(payload);
      const jsonString = decryptV1(decoded);
      return JSON.parse(jsonString);
    } catch (e) {
      console.log(`Error deciphering payload ${payload}`);
      console.log(e);
    }
  }
  return {
    ex: '',
    px: ''
  }
}

const Eula = (props) => {
  const emailpayload = props.match.params.emailpayload;
  const { ex, px } = decipherPayload(emailpayload);
  const email = ex;
  const auth = getAuth();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [agreedToLicense, setAgreedToLicense] = useState(false);
  const licenseEulaFile = localStorage.getItem("licenseEulaFile");

  const handleLogIn = async () => {
    if (!agreedToLicense) {
      setSnackbarOpen(true);
      return;
    }

    if (auth.type === "proxy") {
      try {
        await auth.acceptEula();
        localStorage.removeItem("licenseEulaFile");
        auth.setAcceptedEula(true);
        doRedirect("/", "Eula: proxy acceptance");
      } catch (error) {
        setSnackbarOpen(true);
      }
      return;
    }
    localStorage.removeItem("licenseEulaFile");
    auth.login(email, px);
  };

  return (
    <Wrapper
      snackbarOpen={snackbarOpen}
      setSnackbarOpen={setSnackbarOpen}
      snackbarMessage={"Oops! You need to accept the license agreement."}
    >
      <div
        style={{
          width: "550px",
          color: "#37474f",
          fontSize: "24px",
          fontFamily: "lato",
          fontWeight: "500",
        }}
      >
        License Agreement
      </div>
      <div style={{ height: "24px" }} />
      <embed
        style={{
          height: "350px",
          width: "550px",
          overflowY: "scroll",
          border: "1px solid #cfd8dc",
          padding: "24px"
        }}
        src={`${process.env.PUBLIC_URL}/${licenseEulaFile}`}
      >
      </embed>
      <div style={{ height: "12px" }} />
      <div style={{ width: "550px", display: "flex", alignItems: "center" }}>
        <Radio
          checked={agreedToLicense}
          onClick={() => setAgreedToLicense(!agreedToLicense)}
          style={{ color: "#2E8CC1" }}
        />
        <div
          style={{ fontFamily: "lato", fontWeight: "300", fontSize: "14px" }}
        >
          I agree to the terms and conditions in the above license agreement
          {/*}<a style={{ cursor: "pointer", textDecoration: "underline" }}>here</a>*/}
        </div>
      </div>
      <div style={{ height: "24px" }} />
      <div
        style={{
          width: "550px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button
          variant="contained"
          color="default"
          onClick={() => doRedirect("/login", "Eula: decline button")}
          style={{
            height: "50px",
            width: "270px",
            fontFamily: "lato",
            fontWeight: "700",
          }}
        >
          Decline
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={() => handleLogIn()}
          style={{
            height: "50px",
            width: "270px",
            fontFamily: "lato",
            fontWeight: "700",
          }}
        >
          Accept
        </Button>
      </div>
    </Wrapper>
  );
};

export default Eula;
