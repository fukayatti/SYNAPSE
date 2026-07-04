import { protectedProcedure, publicProcedure, router } from "../index";
import { eventRouter } from "./event";
import { circleRouter } from "./circle";
import { menuRouter } from "./menu";
import { toppingRouter } from "./topping";
import { orderRouter } from "./order";
import { staffRouter } from "./staff";
import { membershipRouter } from "./membership";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  event: eventRouter,
  circle: circleRouter,
  menu: menuRouter,
  topping: toppingRouter,
  order: orderRouter,
  staff: staffRouter,
  membership: membershipRouter,
});
export type AppRouter = typeof appRouter;
