// app.ts
App<IAppOption>({
  globalData: {},
  onLaunch() {
    wx.setInnerAudioOption({
      obeyMuteSwitch: false,
      success: () => undefined,
      fail: () => undefined,
    })
  },
})
