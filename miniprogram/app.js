"use strict";
// app.ts
App({
    globalData: {},
    onLaunch() {
        wx.setInnerAudioOption({
            obeyMuteSwitch: false,
            success: () => undefined,
            fail: () => undefined,
        });
    },
});
