/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import '@material/react-list/index.scss';
import * as React from 'react';
import List, {
  ListDivider,
  ListGroup,
  ListGroupSubheader,
  ListItem,
  ListItemText,
} from '@material/react-list';

export interface ChannelTableProps {
  // TODO: considering moving the RTVs out of the ChannelTable Component altogether and
  // intead having them live directly next door. Still testing.
  rtvs: Map<string, string>;
  handleSelectChannel: (selected: number) => void;
  selectedChannel: number;
}

export class ChannelTable extends React.Component<ChannelTableProps, {}> {
  constructor(props: Readonly<ChannelTableProps>) {
    super(props);
    this.handleChannelChange = this.handleChannelChange.bind(this);
  }

  handleChannelChange = (activatedItem: number): void => {
    if (activatedItem === this.props.selectedChannel) {
      this.props.handleSelectChannel(null);
    } else {
      this.props.handleSelectChannel(activatedItem);
    }
  };

  render(): JSX.Element {
    return (
      <div>
        <ListGroup>
          <ListGroupSubheader tag='h2'>Current Releases</ListGroupSubheader>
          <List
            // TODO: if I do leave the RTVs in this component, will
            // probably make each row two lines and in order to do that
            // I just uncomment "twoLine" :)
            //twoLine
            radioList
            singleSelection
            selectedIndex={this.props.selectedChannel}
            handleSelect={this.handleChannelChange}>
            <ListItem>
              <ListItemText
                primaryText={'Long Term Stable'}
                secondaryText={this.props.rtvs.get('lts')}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Stable'}
                secondaryText={this.props.rtvs.get('stable')}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Opt-in Beta'}
                secondaryText={this.props.rtvs.get('opt-in-beta')}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Opt-in Experimental'}
                secondaryText={this.props.rtvs.get('opt-in-experimental')}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'1% Beta'}
                secondaryText={this.props.rtvs.get('perc-beta')}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'1% Experimental'}
                secondaryText={this.props.rtvs.get('perc-experimental')}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Nightly'}
                secondaryText={this.props.rtvs.get('nightly')}
              />
            </ListItem>
          </List>
        </ListGroup>
      </div>
    );
  }
}
