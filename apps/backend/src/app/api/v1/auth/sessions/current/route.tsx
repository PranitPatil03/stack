import { prismaClient } from "@/prisma-client";
import { createSmartRouteHandler } from "@/route-handlers/smart-route-handler";
import { Prisma } from "@prisma/client";
import { KnownErrors } from "@stackframe/stack-shared";
import { yupObject, clientOrHigherAuthTypeSchema, adaptSchema, signInEmailSchema, yupString, emailVerificationCallbackUrlSchema, yupNumber, yupArray, yupTuple } from "@stackframe/stack-shared/dist/schema-fields";
import { StackAssertionError } from "@stackframe/stack-shared/dist/utils/errors";

export const DELETE = createSmartRouteHandler({
  request: yupObject({
    auth: yupObject({
      type: clientOrHigherAuthTypeSchema,
      project: adaptSchema,
    }).required(),
    headers: yupObject({
      "x-stack-refresh-token": yupTuple([yupString()]),
    }),
  }),
  response: yupObject({
    statusCode: yupNumber().oneOf([200]).required(),
    bodyType: yupString().oneOf(["empty"]).required(),
  }),
  async handler({ auth: { project }, headers: { "x-stack-refresh-token": refreshTokenHeaders } }, fullReq) {
    if (!refreshTokenHeaders || !refreshTokenHeaders[0]) {
      throw new StackAssertionError("Signing out without the refresh token is currently not supported. TODO: implement");
    }
    const refreshToken = refreshTokenHeaders[0];

    try {
      await prismaClient.projectUserRefreshToken.delete({
        where: {
          projectId_refreshToken: {
            projectId: project.id,
            refreshToken,
          },
        },
      });
    } catch (e) {
      // TODO make this less hacky, use a transaction to delete-if-exists instead of try-catch
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        throw new KnownErrors.RefreshTokenNotFound();
      } else {
        throw e;
      }
    }

    return {
      statusCode: 200,
      bodyType: "empty",
    };
  },
});
