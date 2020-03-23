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
  RTVs: string[];
}

export interface ChannelTableState {
  selectedChannel: number;
  //TODO: figure out why ListItemMeta only allows for variables from state and not from props
  //otherwise learn to be happy with RTVs in secondaryText
}

// eslint-disable-next-line prettier/prettier
export class ChannelTable extends React.Component<ChannelTableProps,ChannelTableState
> {
  constructor(props: Readonly<ChannelTableProps>) {
    super(props);
    this.state = {
      selectedChannel: null,
    };
    this.handleSelectChannel = this.handleSelectChannel.bind(this); //
  }

  handleSelectChannel = (selected: number): void => {
    this.setState({selectedChannel: selected});
    console.log(this.state.selectedChannel);
  };

  render(): JSX.Element {
    return (
      <div>
        <ListGroup>
          <ListGroupSubheader tag='h2'>Current Releases</ListGroupSubheader>
          <List
            twoLine
            radioList
            singleSelection
            selectedIndex={this.state.selectedChannel}
            handleSelect={this.handleSelectChannel}>
            <ListItem>
              <ListItemText
                primaryText={'Long Term Stable'}
                secondaryText={this.props.RTVs[0]}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Stable'}
                secondaryText={this.props.RTVs[1]}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Opt-in Beta'}
                secondaryText={this.props.RTVs[2]}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Opt-in Experimental'}
                secondaryText={this.props.RTVs[3]}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'1% Beta'}
                secondaryText={this.props.RTVs[4]}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'1% Experimental'}
                secondaryText={this.props.RTVs[5]}
              />
            </ListItem>
            <ListDivider />
            <ListItem>
              <ListItemText
                primaryText={'Nightly'}
                secondaryText={this.props.RTVs[6]}
              />
            </ListItem>
          </List>
        </ListGroup>
      </div>
    );
  }
}
