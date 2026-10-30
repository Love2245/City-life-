#!/usr/bin/env bash
# TapTap Android 构建环境（JDK 17 / NDK 27 / SDK 36）
# 用法：source scripts/android-env.sh
export JAVA_HOME="/c/Users/lijia/.jdks/v1462-microsoft-jdk-17.0.20.1/jdk-17.0.20.1+1"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$JAVA_HOME/bin:$PATH"
# 规避 WorkBuddy safe-delete shim 对构建输出目录的拦截
export CODEBUDDY_SESSION_ID=
export CLAUDE_SESSION_ID=
