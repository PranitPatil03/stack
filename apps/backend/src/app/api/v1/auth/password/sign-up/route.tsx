import { createSmartRouteHandler } from "@/route-handlers/smart-route-handler";
import { yupObject, yupString, yupNumber, yupBoolean, yupArray, yupMixed } from "@stackframe/stack-shared/dist/schema-fields";
import { adaptSchema, clientOrHigherAuthTypeSchema, emailVerificationCallbackUrlSchema, signInEmailSchema } from "@stackframe/stack-shared/dist/schema-fields";
import { prismaClient } from "@/prisma-client";
import { createAuthTokens } from "@/lib/tokens";
import { getPasswordError } from "@stackframe/stack-shared/dist/helpers/password";
import { StatusError } from "@stackframe/stack-shared/dist/utils/errors";
import { KnownErrors } from "@stackframe/stack-shared";
import { usersCrudHandlers } from "../../../users/crud";
import { contactChannelVerificationCodeHandler } from "../../../contact-channels/verify/verification-code-handler";

export const POST = createSmartRouteHandler({
  request: yupObject({
    auth: yupObject({
      type: clientOrHigherAuthTypeSchema,
      project: adaptSchema,
    }).required(),
    body: yupObject({
      email: signInEmailSchema.required(),
      password: yupString().required(),
      verification_callback_url: emailVerificationCallbackUrlSchema.required(),
    }).required(),
  }),
  response: yupObject({
    statusCode: yupNumber().oneOf([200]).required(),
    bodyType: yupString().oneOf(["json"]).required(),
    body: yupObject({
      access_token: yupString().required(),
      refresh_token: yupString().required(),
      user_id: yupString().required(),
    }).required(),
  }),
  async handler({ auth: { project }, body: { email, password, verification_callback_url: verificationCallbackUrl } }, fullReq) {
    if (!project.evaluatedConfig.credentialEnabled) {
      throw new KnownErrors.PasswordAuthenticationNotEnabled();
    }

    const passwordError = getPasswordError(password);
    if (passwordError) {
      throw passwordError;
    }

    // TODO: make this a transaction
    const users = await prismaClient.projectUser.findMany({
      where: {
        projectId: project.id,
        primaryEmail: email,
        authWithEmail: true,
      },
    });

    if (users.length > 0) {
      throw new KnownErrors.UserEmailAlreadyExists();
    }

    const createdUser = await usersCrudHandlers.adminCreate({
      project,
      data: {
        primary_email_auth_enabled: true,
        primary_email: email,
        primary_email_verified: false,
        password,
      },
    });

    await contactChannelVerificationCodeHandler.sendCode({
      project,
      data: {
        user_id: createdUser.id,
      },
      method: {
        email,
      },
      callbackUrl: verificationCallbackUrl,
    }, {
      user: createdUser,
    });

    const { refreshToken, accessToken } = await createAuthTokens({
      projectId: project.id,
      projectUserId: createdUser.id,
    });

    return {
      statusCode: 200,
      bodyType: "json",
      body: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user_id: createdUser.id,
      },
    };
  },
});
