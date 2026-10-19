package com.dartlead.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceScorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
