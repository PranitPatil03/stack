import { encodeAccessToken } from "@/lib/tokens";
import { prismaClient } from "@/prisma-client";
import { createSmartRouteHandler } from "@/route-handlers/smart-route-handler";
import { KnownErrors } from "@stackframe/stack-shared";
import { yupObject, clientOrHigherAuthTypeSchema, adaptSchema, yupString, yupNumber, yupTuple } from "@stackframe/stack-shared/dist/schema-fields";
import { StackAssertionError } from "@stackframe/stack-shared/dist/utils/errors";

export const POST = createSmartRouteHandler({
  request: yupObject({
    auth: yupObject({
      type: clientOrHigherAuthTypeSchema,
      project: adaptSchema,
    }).required(),
    headers: yupObject({
      "x-stack-refresh-token": yupTuple([yupString().required()]).required(),
    }),
  }),
  response: yupObject({
    statusCode: yupNumber().oneOf([200]).required(),
    bodyType: yupString().oneOf(["json"]).required(),
    body: yupObject({
      access_token: yupString().required(),
    }).required(),
  }),
  async handler({ auth: { project }, headers: { "x-stack-refresh-token": refreshTokenHeaders } }, fullReq) {
    const refreshToken = refreshTokenHeaders[0];

    const sessionObj = await prismaClient.projectUserRefreshToken.findUnique({
      where: {
        projectId_refreshToken: {
          projectId: project.id,
          refreshToken,
        },
      },
    });
    if (!sessionObj) {
      throw new KnownErrors.RefreshTokenNotFound();
    }

    const accessToken = await encodeAccessToken({
      projectId: sessionObj.projectId,
      userId: sessionObj.projectUserId,
    });

    return {
      statusCode: 200,
      bodyType: "json",
      body: {
        access_token: accessToken,
      },
    };
  },
});
