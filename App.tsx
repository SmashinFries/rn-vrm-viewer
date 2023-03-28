import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { VRMAvatar } from './src/avatar/vrmAvatar';

const App = () => {
    const { width, height } = useWindowDimensions();

    return (
        <View style={{ width: width, height: height, alignItems: 'center' }}>
            <VRMAvatar />
        </View>
    );
};

export default App;
